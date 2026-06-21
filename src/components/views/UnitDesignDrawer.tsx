import { useMemo, useRef, useState } from "react";
import { Check, Code2, Maximize2, MessageSquare, RefreshCw, Send, Sparkles, Trash2, Upload, X } from "lucide-react";
import { ScreenshotCarousel } from "@/components/ScreenshotCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UnitScreenshotImageData } from "@/lib/api";
import { detectUnitDesignChatIntent, unitDesignIntentLabel } from "@/lib/design-chat";
import type { UnitDesignChatAttachment, UnitDesignChatIntent, UnitDesignChatMessage } from "@/lib/types";
import { cn, DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";

type DrawerImageKind = "screenshot" | "design" | "upload";

interface DrawerImage {
  kind: DrawerImageKind;
  name: string;
  path: string;
  dataUrl: string;
  capturedAt: number;
}

interface UploadedDrawerImage extends DrawerImage {
  kind: "upload";
}

export function UnitDesignDrawer({
  designImages,
  explorationDir,
  hasNextUnit,
  isGenerating,
  messages,
  reviewMode,
  screenshotDir,
  screenshots,
  unitPath,
  unitTitle,
  onApproveScreenshots,
  onClose,
  onDiscardScreenshots,
  onExecuteNextUnit,
  onQueueScreenshotFeedback,
  onSaveReferenceImage,
  onSendMessage,
}: {
  designImages: UnitScreenshotImageData[];
  explorationDir: string;
  hasNextUnit: boolean;
  isGenerating: boolean;
  messages: UnitDesignChatMessage[];
  reviewMode: boolean;
  screenshotDir: string;
  screenshots: UnitScreenshotImageData[];
  unitPath: string;
  unitTitle: string;
  onApproveScreenshots: () => void;
  onClose: () => void;
  onDiscardScreenshots: () => void;
  onExecuteNextUnit: () => void;
  onQueueScreenshotFeedback: (comments: { name: string; comment: string }[]) => void;
  onSaveReferenceImage: (file: File) => Promise<string>;
  onSendMessage: (message: string, attachments: UnitDesignChatAttachment[], intent: UnitDesignChatIntent) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedDrawerImage[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isSavingUpload, setIsSavingUpload] = useState(false);
  const [selectedAttachmentKeys, setSelectedAttachmentKeys] = useState<string[]>([]);
  const [largePreviewKey, setLargePreviewKey] = useState("");
  const [message, setMessage] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});

  const screenshotImages = useMemo<DrawerImage[]>(() => screenshots.map((image) => ({
    kind: "screenshot",
    name: image.name,
    path: `${screenshotDir}/${image.name}`,
    dataUrl: image.dataUrl,
    capturedAt: image.capturedAt,
  })), [screenshotDir, screenshots]);
  const candidateImages = useMemo<DrawerImage[]>(() => designImages.map((image) => ({
    kind: "design",
    name: image.name,
    path: `${explorationDir}/${image.name}`,
    dataUrl: image.dataUrl,
    capturedAt: image.capturedAt,
  })), [designImages, explorationDir]);
  const allImages = [...screenshotImages, ...candidateImages, ...uploadedImages];
  const selectedAttachments = allImages
    .filter((image) => selectedAttachmentKeys.includes(imageKey(image)))
    .map<UnitDesignChatAttachment>((image) => ({ kind: image.kind, name: image.name, path: image.path }));
  const detectedIntent = detectUnitDesignChatIntent(message, selectedAttachments.map((attachment) => attachment.kind));
  const currentReviewImage = screenshots[Math.min(reviewIndex, screenshots.length - 1)];
  const commentedCount = Object.values(reviewComments).filter((value) => value.trim()).length;
  const largePreviewImage = allImages.find((image) => imageKey(image) === largePreviewKey) || null;

  const toggleAttachment = (image: DrawerImage) => {
    const key = imageKey(image);
    setSelectedAttachmentKeys((current) => (
      current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key]
    ));
  };

  const chooseUploadImages = async (files: FileList | null | undefined) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    setUploadStatus(`Saving ${imageFiles.length} reference ${imageFiles.length === 1 ? "image" : "images"}`);
    setIsSavingUpload(true);
    try {
      const savedImages = await Promise.all(imageFiles.map(async (file) => {
        const [dataUrl, savedPath] = await Promise.all([
          imageFileDataUrl(file),
          onSaveReferenceImage(file),
        ]);
        return {
          kind: "upload" as const,
          name: file.name || "reference image",
          path: savedPath,
          dataUrl,
          capturedAt: Math.floor(Date.now() / 1000),
        };
      }));
      setUploadedImages((current) => [...current, ...savedImages]);
      setSelectedAttachmentKeys((current) => [
        ...current,
        ...savedImages.map(imageKey).filter((key) => !current.includes(key)),
      ]);
      setUploadStatus(`${savedImages.length} reference ${savedImages.length === 1 ? "image" : "images"} attached`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not save reference images");
    } finally {
      setIsSavingUpload(false);
    }
  };

  const sendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, selectedAttachments, detectedIntent);
    setMessage("");
    setSelectedAttachmentKeys([]);
  };

  const queueReviewFeedback = () => {
    const payload = screenshots
      .map((image) => ({ name: image.name, comment: (reviewComments[image.name] || "").trim() }))
      .filter((entry) => entry.comment);
    if (payload.length) onQueueScreenshotFeedback(payload);
  };

  return (
    <section
      aria-label={`Design workspace for ${unitTitle}`}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
      data-unit-design-drawer="true"
      role="dialog"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-card">
            <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-sm font-semibold">Design</h2>
            <p className="m-0 truncate text-xs text-muted-foreground">{unitTitle} · {unitPath}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reviewMode && screenshots.length ? <Badge variant="secondary">Screenshot review</Badge> : null}
          {isGenerating ? <Badge variant="outline">Agent starting</Badge> : null}
          <Button aria-label="Close design drawer" className="size-8" size="icon" type="button" variant="outline" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b bg-background lg:border-b-0 lg:border-r" data-unit-design-image-selector="true">
          <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold">Images</p>
              <p className="m-0 text-xs text-muted-foreground">{selectedAttachments.length} attached</p>
            </div>
            <div>
              <Input
                ref={uploadInputRef}
                accept="image/*"
                aria-hidden="true"
                className="pointer-events-none absolute size-px opacity-0"
                disabled={isSavingUpload}
                tabIndex={-1}
                type="file"
                multiple
                onChange={(event) => {
                  void chooseUploadImages(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <Button className="min-h-9" disabled={isSavingUpload} size="sm" type="button" variant="outline" onClick={() => uploadInputRef.current?.click()}>
                <Upload aria-hidden="true" data-icon="inline-start" />
                Upload
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ImageSection
              empty="No screenshots captured yet"
              images={screenshotImages}
              selectedKeys={selectedAttachmentKeys}
              title="Screenshots"
              onPreview={(image) => setLargePreviewKey(imageKey(image))}
              onToggle={toggleAttachment}
            />
            <ImageSection
              className="mt-4"
              empty="No design images yet"
              images={candidateImages}
              selectedKeys={selectedAttachmentKeys}
              title="Design images"
              onPreview={(image) => setLargePreviewKey(imageKey(image))}
              onToggle={toggleAttachment}
            />
            <ImageSection
              className="mt-4"
              empty={uploadStatus || "Upload reference images to attach them"}
              images={uploadedImages}
              selectedKeys={selectedAttachmentKeys}
              title="Uploads"
              onPreview={(image) => setLargePreviewKey(imageKey(image))}
              onToggle={toggleAttachment}
            />
          </div>
        </aside>

        <main className="flex min-h-0 flex-col" data-unit-design-chat="true">
          {reviewMode && screenshots.length ? (
            <section className="shrink-0 border-b bg-background p-3" data-unit-design-review="true">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                <ScreenshotCarousel
                  className="h-[min(38vh,22rem)]"
                  getImageLabel={(image) => `${screenshotDir}/${image.name}`}
                  images={screenshots}
                  index={reviewIndex}
                  onIndexChange={setReviewIndex}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold">Review screenshots</p>
                      <p className="m-0 truncate font-mono text-xs text-muted-foreground">{currentReviewImage ? `${screenshotDir}/${currentReviewImage.name}` : "No screenshot selected"}</p>
                    </div>
                    <Button className="text-muted-foreground hover:text-destructive" size="sm" type="button" variant="ghost" onClick={onDiscardScreenshots}>
                      <Trash2 aria-hidden="true" data-icon="inline-start" />
                      Discard
                    </Button>
                  </div>
                  <Label htmlFor="design-drawer-review-comment">Issue or feedback</Label>
                  <Textarea
                    {...DISABLE_TEXT_CORRECTION_PROPS}
                    className="min-h-20"
                    id="design-drawer-review-comment"
                    placeholder="Describe what should change in this screenshot..."
                    value={currentReviewImage ? reviewComments[currentReviewImage.name] || "" : ""}
                    onChange={(event) => {
                      if (!currentReviewImage) return;
                      setReviewComments((current) => ({ ...current, [currentReviewImage.name]: event.target.value }));
                    }}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    {commentedCount ? <Button variant="outline" onClick={queueReviewFeedback}>Queue feedback ({commentedCount})</Button> : null}
                    <Button variant="outline" onClick={onApproveScreenshots}>
                      <Check aria-hidden="true" data-icon="inline-start" />
                      Looks good
                    </Button>
                    {hasNextUnit ? <Button onClick={onExecuteNextUnit}>Execute next unit</Button> : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {messages.length ? (
              <div className="mx-auto flex max-w-4xl flex-col gap-3">
                {messages.map((entry) => (
                  <article className="rounded-md border bg-card p-3 shadow-sm" key={entry.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {entry.intent === "implement-ui" ? <Code2 aria-hidden="true" className="size-4 text-muted-foreground" /> : <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />}
                        <Badge variant={entry.intent === "implement-ui" ? "secondary" : "outline"}>{unitDesignIntentLabel(entry.intent)}</Badge>
                        <span className="text-xs text-muted-foreground">{entry.status}</span>
                      </div>
                      <time className="text-xs tabular-nums text-muted-foreground">{formatMessageTime(entry.createdAt)}</time>
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-sm leading-6">{entry.text}</p>
                    {entry.attachments.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {entry.attachments.map((attachment) => (
                          <Badge className="max-w-full font-mono" key={`${entry.id}-${attachment.path}`} variant="outline">
                            <span className="truncate">{attachment.kind}: {attachment.path}</span>
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[18rem] items-center justify-center">
                <div className="grid max-w-lg gap-2 text-center">
                  <MessageSquare aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
                  <h3 className="m-0 text-base font-semibold">Iterate on this unit</h3>
                  <p className="m-0 text-sm text-muted-foreground">Attach screenshots, design images, or references, then ask for new design options or ask the agent to update the unit UI.</p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t bg-background p-3">
            <div className="mx-auto grid max-w-4xl gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={detectedIntent === "implement-ui" ? "secondary" : "outline"}>
                  {detectedIntent === "implement-ui" ? <Code2 aria-hidden="true" data-icon="inline-start" /> : <Sparkles aria-hidden="true" data-icon="inline-start" />}
                  Detected: {unitDesignIntentLabel(detectedIntent)}
                </Badge>
                {selectedAttachments.length ? <span className="text-xs text-muted-foreground">{selectedAttachments.length} image{selectedAttachments.length === 1 ? "" : "s"} attached</span> : null}
              </div>
              <Textarea
                {...DISABLE_TEXT_CORRECTION_PROPS}
                className="min-h-24 resize-y"
                placeholder="Example: Update this screen to match the selected design image, or give me 3 more versions of this design."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <div className="flex justify-end">
                <Button disabled={isGenerating || !message.trim()} onClick={sendMessage}>
                  {isGenerating ? <RefreshCw aria-hidden="true" data-icon="inline-start" /> : <Send aria-hidden="true" data-icon="inline-start" />}
                  Send Message
                </Button>
              </div>
            </div>
          </footer>
        </main>
      </div>

      <Dialog open={Boolean(largePreviewImage)} onOpenChange={(open) => { if (!open) setLargePreviewKey(""); }}>
        <DialogContent className="max-h-[min(calc(100vh-2rem),50rem)] w-[min(calc(100vw-2rem),72rem)] overflow-x-hidden overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Image preview</DialogTitle>
            <DialogDescription className="font-mono">{largePreviewImage?.path || "Image"}</DialogDescription>
          </DialogHeader>
          {largePreviewImage ? (
            <div className="overflow-hidden rounded-md bg-muted shadow-sm">
              <img alt={`Preview ${largePreviewImage.name}`} className="max-h-[min(72vh,42rem)] w-full object-contain" src={largePreviewImage.dataUrl} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ImageSection({
  className,
  empty,
  images,
  selectedKeys,
  title,
  onPreview,
  onToggle,
}: {
  className?: string;
  empty: string;
  images: DrawerImage[];
  selectedKeys: string[];
  title: string;
  onPreview: (image: DrawerImage) => void;
  onToggle: (image: DrawerImage) => void;
}) {
  return (
    <section className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {images.length ? <Badge variant="outline">{images.length}</Badge> : null}
      </div>
      {images.length ? (
        <TooltipProvider>
          <div className="grid grid-cols-2 gap-2">
            {images.map((image) => {
              const key = imageKey(image);
              const selected = selectedKeys.includes(key);
              return (
                <div
                  className={cn(
                    "group relative overflow-hidden rounded-md border-2 border-transparent bg-card transition-colors hover:bg-muted/40",
                    selected && "border-primary",
                  )}
                  key={key}
                >
                  <button
                    aria-pressed={selected}
                    className="flex min-h-0 w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    type="button"
                    onClick={() => onToggle(image)}
                  >
                    <img alt={`${title} ${image.name}`} className="aspect-video w-full bg-muted object-contain outline outline-1 outline-black/10" src={image.dataUrl} />
                    <span className="min-w-0 truncate px-2 py-1.5 font-mono text-[0.68rem] text-muted-foreground">{image.name}</span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={`Open larger view of ${image.name}`}
                        className="absolute right-1 top-1 size-7 rounded-md bg-background/90 opacity-90 shadow-sm transition-opacity hover:bg-background hover:opacity-100"
                        size="icon"
                        type="button"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreview(image);
                        }}
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
        <div className="rounded-md border border-dashed bg-background/70 px-3 py-4 text-xs text-muted-foreground">{empty}</div>
      )}
    </section>
  );
}

function imageKey(image: Pick<DrawerImage, "kind" | "path">) {
  return `${image.kind}:${image.path}`;
}

function imageFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Could not read reference image"));
    reader.readAsDataURL(file);
  });
}

function formatMessageTime(value: number) {
  if (!value) return "";
  return new Date(value * 1000).toLocaleString();
}
