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

// Post-run review gate: step through a unit's screenshots, leave a comment on
// any with a problem, then close / queue the feedback (drained to the agent
// later, in batches) / execute the next unit.
export function UnitScreenshotReviewDialog({ review, unitTitle, hasNextUnit, onClose, onQueueFeedback, onSendFeedback, onExecuteNext }: {
  review: ScreenshotReview;
  unitTitle: string;
  hasNextUnit: boolean;
  onClose: () => void;
  onQueueFeedback: (comments: { name: string; comment: string }[]) => void;
  onSendFeedback: (comments: { name: string; comment: string }[]) => void;
  onExecuteNext: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [comments, setComments] = useState<Record<string, string>>({});
  const current = review.images[Math.min(index, review.images.length - 1)];
  const commentedCount = Object.values(comments).filter((value) => value.trim()).length;

  const buildPayload = () =>
    review.images
      .map((image) => ({ name: image.name, comment: (comments[image.name] || "").trim() }))
      .filter((entry) => entry.comment);
  const queueFeedback = () => {
    const payload = buildPayload();
    if (payload.length) onQueueFeedback(payload);
  };
  const sendFeedback = () => {
    const payload = buildPayload();
    if (payload.length) onSendFeedback(payload);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[min(calc(100vw-2rem),56rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review screenshots — {unitTitle}</DialogTitle>
          <DialogDescription>
            Step through what the agent built. Add a comment on any screenshot with a problem, then queue the feedback or move on.
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
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={queueFeedback}>Add Feedback ({commentedCount})</Button>
              <Button onClick={sendFeedback}>Send Feedback ({commentedCount})</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Looks good</Button>
              {hasNextUnit ? <Button onClick={onExecuteNext}>Execute next unit</Button> : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
