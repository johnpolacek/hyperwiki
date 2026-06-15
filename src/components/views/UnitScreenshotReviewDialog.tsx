import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScreenshotCarousel } from "@/components/ScreenshotCarousel";
import type { UnitScreenshotImageData } from "@/lib/api";

export interface ScreenshotReview {
  unitPath: string;
  sessionId: string | null;
  images: UnitScreenshotImageData[];
}

// Post-run review gate: step through a unit's screenshots. With no issues,
// approve (Looks good) or advance (Execute next unit). With comments, Add
// feedback to the queue — it's sent to the agent later via "Send all".
export function UnitScreenshotReviewDialog({ review, unitTitle, hasNextUnit, onApprove, onDismiss, onQueueFeedback, onExecuteNext }: {
  review: ScreenshotReview;
  unitTitle: string;
  hasNextUnit: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onQueueFeedback: (comments: { name: string; comment: string }[]) => void;
  onExecuteNext: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [comments, setComments] = useState<Record<string, string>>({});
  const current = review.images[Math.min(index, review.images.length - 1)];
  const commentedCount = Object.values(comments).filter((value) => value.trim()).length;

  // Closing with no typed comments approves (you looked, no issues); with unsent
  // comments it just dismisses so the gate isn't silently cleared.
  const handleClose = () => (commentedCount > 0 ? onDismiss() : onApprove());
  const queueFeedback = () => {
    const payload = review.images
      .map((image) => ({ name: image.name, comment: (comments[image.name] || "").trim() }))
      .filter((entry) => entry.comment);
    if (payload.length) onQueueFeedback(payload);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="w-[min(calc(100vw-2rem),56rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review screenshots — {unitTitle}</DialogTitle>
          <DialogDescription>
            Step through what the agent built. Comment on any screenshot with a problem and Add feedback to the queue, or approve and move on.
          </DialogDescription>
        </DialogHeader>

        <ScreenshotCarousel
          className="h-[min(60vh,32rem)]"
          images={review.images}
          index={index}
          onIndexChange={setIndex}
        />

        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="screenshot-issue-comment">
            Issue with <span className="font-mono">{current?.name}</span> (optional)
          </label>
          <Textarea
            className="min-h-20"
            id="screenshot-issue-comment"
            placeholder="Describe what looks wrong in this screenshot…"
            value={current ? comments[current.name] || "" : ""}
            onChange={(event) => {
              if (!current) return;
              const value = event.target.value;
              setComments((prev) => ({ ...prev, [current.name]: value }));
            }}
          />
        </div>

        <DialogFooter>
          {commentedCount > 0 ? (
            <>
              <Button variant="outline" onClick={onDismiss}>Close</Button>
              <Button onClick={queueFeedback}>Add feedback ({commentedCount})</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onApprove}>Looks good</Button>
              {hasNextUnit ? <Button onClick={onExecuteNext}>Execute next unit</Button> : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
