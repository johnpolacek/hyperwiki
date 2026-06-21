import { useEffect, useRef, useState } from "react";
import { ImagePlus, Maximize2, RefreshCw, Send, Sparkles, Upload } from "lucide-react";
import { ScreenshotCarousel } from "@/components/ScreenshotCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UnitScreenshotImageData } from "@/lib/api";
import type { UnitExplorationMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";

export type UnitExplorationMode = "new-mockups" | "redesign-from-screenshot";

export interface UnitDesignExplorationGenerateInput {
  mode: UnitExplorationMode;
  prompt: string;
  variantCount: number;
  sourceScreenshotNames: string[];
  sourceScreenshotPaths: string[];
  referenceImagePaths: string[];
}

interface ReferenceImage {
  id: string;
  name: string;
  path: string;
  dataUrl: string;
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
  onSaveReferenceImage,
  onSendMessage,
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
  onSaveReferenceImage: (file: File) => Promise<string>;
  onSendMessage: (message: string, candidateName: string | null) => void;
  onSelect: (candidateName: string, notes: string, textBrief: string) => void;
}) {
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<UnitExplorationMode>("new-mockups");
  const [variantCount, setVariantCount] = useState("3");
  const [prompt, setPrompt] = useState("");
  const [sourceScreenshotNames, setSourceScreenshotNames] = useState<string[]>([]);
  const [previewSourceScreenshotName, setPreviewSourceScreenshotName] = useState("");
  const [largePreviewImageName, setLargePreviewImageName] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referenceImageStatus, setReferenceImageStatus] = useState("");
  const [isSavingReferenceImage, setIsSavingReferenceImage] = useState(false);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [textBrief, setTextBrief] = useState("");
  const [message, setMessage] = useState("");
  const [isSetupView, setIsSetupView] = useState(false);
  const current = images[Math.min(index, images.length - 1)];
  const selectedName = metadata?.selectedCandidate || "";
  const hasCandidates = images.length > 0;
  const showSetupView = !hasCandidates || isSetupView;

  useEffect(() => {
    if (!open) return;
    const metadataMode = screenshots.length ? "redesign-from-screenshot" : "new-mockups";
    setMode(metadataMode);
    setVariantCount(String(Math.min(Math.max(metadata?.imageCount || 3, 1), 4)));
    setPrompt(metadata?.prompt || "");
    setNotes(metadata?.notes || "");
    setTextBrief(metadata?.textBrief || "");
    setMessage("");
    setIsSetupView(false);
    setIndex(0);
    setReferenceImages([]);
    setReferenceImageStatus("");
    setLargePreviewImageName("");
    const metadataSourceName = metadata?.sourceScreenshotPath?.split("/").pop() || "";
    setSourceScreenshotNames(metadataSourceName ? [metadataSourceName] : screenshots[0]?.name ? [screenshots[0].name] : []);
    setPreviewSourceScreenshotName(metadataSourceName || screenshots[0]?.name || "");
  }, [open, unitPath, metadata, screenshots]);

  useEffect(() => {
    if (mode !== "redesign-from-screenshot") return;
    if (sourceScreenshotNames.length || !screenshots.length) return;
    setSourceScreenshotNames([screenshots[0].name]);
    setPreviewSourceScreenshotName(screenshots[0].name);
  }, [mode, screenshots, sourceScreenshotNames.length]);
  const previewSourceScreenshot = screenshots.find((image) => image.name === previewSourceScreenshotName) || screenshots[0] || null;
  const largePreviewImage = screenshots.find((image) => image.name === largePreviewImageName) || null;

  const submitGenerate = () => {
    const count = Math.min(Math.max(Number.parseInt(variantCount, 10) || 1, 1), 4);
    const sourceNames = mode === "redesign-from-screenshot" ? sourceScreenshotNames : [];
    setIsSetupView(false);
    onGenerate({
      mode,
      prompt: prompt.trim(),
      variantCount: count,
      sourceScreenshotNames: sourceNames,
      sourceScreenshotPaths: sourceNames.map((name) => `${screenshotDir}/${name}`),
      referenceImagePaths: referenceImages.map((image) => image.path),
    });
  };

  const chooseReferenceImages = async (files: FileList | null | undefined) => {
    const imageFiles = Array.from(files || []);
    if (!imageFiles.length) return;
    setReferenceImageStatus(`Saving ${imageFiles.length} reference ${imageFiles.length === 1 ? "image" : "images"}`);
    setIsSavingReferenceImage(true);
    try {
      const savedImages = await Promise.all(imageFiles.map(async (file, fileIndex) => {
        const [dataUrl, savedPath] = await Promise.all([
          imageFileDataUrl(file),
          onSaveReferenceImage(file),
        ]);
        return {
          id: `${savedPath}-${Date.now()}-${fileIndex}`,
          name: file.name || "reference image",
          path: savedPath,
          dataUrl,
        };
      }));
      setReferenceImages((currentImages) => [...currentImages, ...savedImages]);
      setReferenceImageStatus(`${savedImages.length} reference ${savedImages.length === 1 ? "image" : "images"} saved`);
    } catch (error) {
      setReferenceImageStatus(error instanceof Error ? error.message : "Could not save reference images");
    } finally {
      setIsSavingReferenceImage(false);
    }
  };

  const removeReferenceImage = (id: string) => {
    setReferenceImages((currentImages) => currentImages.filter((image) => image.id !== id));
  };

  const toggleSourceScreenshot = (name: string) => {
    setPreviewSourceScreenshotName(name);
    setSourceScreenshotNames((currentNames) => (
      currentNames.includes(name)
        ? currentNames.filter((currentName) => currentName !== name)
        : [...currentNames, name]
    ));
  };

  const openLargePreview = (name: string) => {
    setLargePreviewImageName(name);
  };

  const startNewExploration = () => {
    setIsSetupView(true);
    setPrompt("");
    setVariantCount("3");
    setMode(screenshots.length ? "redesign-from-screenshot" : "new-mockups");
    setReferenceImages([]);
    setReferenceImageStatus("");
    setMessage("");
    const firstScreenshotName = screenshots[0]?.name || "";
    setSourceScreenshotNames(firstScreenshotName ? [firstScreenshotName] : []);
    setPreviewSourceScreenshotName(firstScreenshotName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(calc(100vh-2rem),54rem)] w-[min(calc(100vw-2rem),78rem)] overflow-x-hidden overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Explore designs — {unitTitle}</DialogTitle>
        </DialogHeader>

        {showSetupView ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              {hasCandidates ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline">{images.length} existing preserved</Badge>
                  <Button size="sm" type="button" variant="outline" onClick={() => setIsSetupView(false)}>
                    <ImagePlus aria-hidden="true" data-icon="inline-start" />
                    View Existing
                  </Button>
                </div>
              ) : null}
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
                  <ToggleGroupItem className="flex-1" disabled={!screenshots.length} value="redesign-from-screenshot">Redesign</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="unit-exploration-variants">Variants</Label>
                <Select
                  id="unit-exploration-variants"
                  value={variantCount}
                  onChange={(event) => setVariantCount(event.target.value)}
                >
                  <option value="1">1 design</option>
                  <option value="2">2 designs</option>
                  <option value="3">3 designs</option>
                  <option value="4">4 designs</option>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="unit-exploration-prompt">Direction</Label>
                <Textarea
                  className="min-h-40"
                  id="unit-exploration-prompt"
                  placeholder="Clean up hierarchy, make the main workflow easier to scan, preserve the product tone…"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="unit-exploration-reference">Reference image</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    ref={referenceInputRef}
                    accept="image/*"
                    aria-hidden="true"
                    className="pointer-events-none absolute size-px opacity-0"
                    disabled={isSavingReferenceImage}
                    id="unit-exploration-reference"
                    tabIndex={-1}
                    type="file"
                    multiple
                    onChange={(event) => {
                      void chooseReferenceImages(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <Button
                    className="w-fit"
                    disabled={isSavingReferenceImage}
                    type="button"
                    variant="outline"
                    onClick={() => referenceInputRef.current?.click()}
                  >
                    <Upload aria-hidden="true" data-icon="inline-start" />
                    {referenceImages.length ? "Add reference images" : "Choose reference images"}
                  </Button>
                  {referenceImages.length ? <Badge variant="outline">{referenceImages.length} added</Badge> : null}
                </div>
                {referenceImages.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {referenceImages.map((image) => (
                      <div className="overflow-hidden rounded-md border bg-muted/30" key={image.id}>
                        <img
                          alt={`Reference image ${image.name}`}
                          className="aspect-video w-full bg-muted object-contain"
                          src={image.dataUrl}
                        />
                        <div className="flex items-center justify-between gap-2 border-t bg-card px-2 py-1.5 text-xs">
                          <span className="min-w-0 truncate font-mono" title={image.path}>{image.name}</span>
                          <Button size="sm" type="button" variant="outline" onClick={() => removeReferenceImage(image.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {referenceImageStatus ? <p className="m-0 text-xs text-muted-foreground">{referenceImageStatus}</p> : null}
              </div>

              <Button disabled={isGenerating || (mode === "redesign-from-screenshot" && !sourceScreenshotNames.length)} onClick={submitGenerate}>
                {isGenerating ? <RefreshCw aria-hidden="true" data-icon="inline-start" /> : <Sparkles aria-hidden="true" data-icon="inline-start" />}
                {isGenerating ? "Starting" : "Generate"}
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {mode === "redesign-from-screenshot" ? (
                <>
                  <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ImagePlus aria-hidden="true" className="size-4 text-muted-foreground" />
                      <span className="truncate text-sm font-semibold">Source screenshots</span>
                      <Badge variant="outline">{sourceScreenshotNames.length} selected</Badge>
                    </div>
                  </div>
                  {screenshots.length ? (
                    <TooltipProvider>
                      <div className="grid max-h-[34rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {screenshots.map((image) => {
                          const selected = sourceScreenshotNames.includes(image.name);
                          return (
                            <div
                              className={cn(
                                "group relative min-w-0 overflow-hidden rounded-md border-2 border-transparent bg-card transition-colors hover:bg-muted/35",
                                selected && "border-primary",
                              )}
                              key={image.name}
                            >
                              <button
                                aria-pressed={selected}
                                className="flex w-full min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                type="button"
                                onClick={() => toggleSourceScreenshot(image.name)}
                              >
                                <img
                                  alt={`Source screenshot thumbnail ${image.name}`}
                                  className="aspect-video w-full bg-muted object-contain"
                                  src={image.dataUrl}
                                />
                                <span className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                                  <span className="truncate font-mono">{image.name}</span>
                                </span>
                              </button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    aria-label={`Open larger view of ${image.name}`}
                                    className="absolute right-1.5 top-1.5 size-7 rounded-md bg-background/90 opacity-90 shadow-sm transition-opacity hover:bg-background hover:opacity-100"
                                    size="icon"
                                    type="button"
                                    variant="outline"
                                    onClick={() => openLargePreview(image.name)}
                                  >
                                    <Maximize2 aria-hidden="true" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open larger view</TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  ) : (
                    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 p-8 text-center">
                      <ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" />
                      <p className="m-0 text-sm font-medium">No screenshots captured yet</p>
                      <p className="m-0 max-w-sm text-sm text-muted-foreground">Generate new mockups first, or run the unit to capture screenshots before redesigning.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/30 p-8 text-center">
                  <ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" />
                  <div className="flex flex-col gap-1">
                    <p className="m-0 text-sm font-medium">View 1: setup</p>
                    <p className="m-0 max-w-sm text-sm text-muted-foreground">Describe the direction and generate designs. The generated view will appear after the agent writes images.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ImagePlus aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">Candidates ({images.length})</span>
                {selectedName ? <Badge variant="secondary">Selected {selectedName}</Badge> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" type="button" variant="outline" onClick={startNewExploration}>
                  <Sparkles aria-hidden="true" data-icon="inline-start" />
                  New Exploration
                </Button>
                <Button
                  disabled={!current}
                  size="sm"
                  onClick={() => {
                    if (current) onSelect(current.name, notes.trim(), textBrief.trim());
                  }}
                >
                  Use Design
                </Button>
              </div>
            </div>

            <ScreenshotCarousel
              className="h-[min(62vh,38rem)]"
              getImageLabel={(image) => `${explorationDir}/${image.name}`}
              images={images}
              index={index}
              onIndexChange={setIndex}
            />
            <div className="flex flex-col gap-3">
              <Label htmlFor="unit-exploration-message">Message</Label>
              <Textarea
                className="min-h-24"
                id="unit-exploration-message"
                placeholder="Make this feel closer to the reference images, or start over with a denser layout."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  disabled={isGenerating || !message.trim()}
                  onClick={() => {
                    const trimmedMessage = message.trim();
                    if (!trimmedMessage) return;
                    onSendMessage(trimmedMessage, current?.name || null);
                    setMessage("");
                  }}
                >
                  <Send aria-hidden="true" data-icon="inline-start" />
                  Send Message
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>

        <Dialog
          open={Boolean(largePreviewImage)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setLargePreviewImageName("");
          }}
        >
          <DialogContent className="max-h-[min(calc(100vh-2rem),50rem)] w-[min(calc(100vw-2rem),72rem)] overflow-x-hidden overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Source screenshot preview</DialogTitle>
              <DialogDescription className="font-mono">
                {largePreviewImage?.name || "Screenshot"}
              </DialogDescription>
            </DialogHeader>
            {largePreviewImage ? (
              <div className="overflow-hidden rounded-md bg-muted shadow-sm">
                <img
                  alt={`Larger source screenshot preview ${largePreviewImage.name}`}
                  className="max-h-[min(72vh,42rem)] w-full object-contain"
                  src={largePreviewImage.dataUrl}
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function imageFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Could not read reference image"));
    reader.readAsDataURL(file);
  });
}
