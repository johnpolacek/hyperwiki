import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UnitScreenshotImageData } from "@/lib/api";

// Shared step-through viewer for a unit's screenshots. Controlled: the parent
// owns `index` so it can bind per-image UI (e.g. the review comment field).
// Reused by the inline unit-page lightbox and the post-run review dialog.
export function ScreenshotCarousel({ images, index, onIndexChange, className, imageClassName }: {
  images: UnitScreenshotImageData[];
  index: number;
  onIndexChange: (next: number) => void;
  className?: string;
  imageClassName?: string;
}) {
  if (!images.length) return null;
  const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const current = images[safeIndex];
  const hasMultiple = images.length > 1;
  const go = (delta: number) => onIndexChange(Math.min(Math.max(safeIndex + delta, 0), images.length - 1));

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      }}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted">
        <img
          alt={`Screenshot ${safeIndex + 1} of ${images.length}: ${current.name}`}
          className={cn("max-h-full max-w-full object-contain", imageClassName)}
          src={current.dataUrl}
        />
        {hasMultiple ? (
          <>
            <Button
              aria-label="Previous screenshot"
              className="absolute left-2 top-1/2 size-9 -translate-y-1/2 rounded-full"
              disabled={safeIndex === 0}
              size="icon"
              variant="outline"
              onClick={() => go(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              aria-label="Next screenshot"
              className="absolute right-2 top-1/2 size-9 -translate-y-1/2 rounded-full"
              disabled={safeIndex === images.length - 1}
              size="icon"
              variant="outline"
              onClick={() => go(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-mono">{current.name}</span>
        {hasMultiple ? <span className="shrink-0">{safeIndex + 1} of {images.length}</span> : null}
      </div>
    </div>
  );
}
