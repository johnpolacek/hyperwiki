import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        ok: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        running: "border-transparent bg-primary/10 text-primary",
        warn: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
        error: "border-transparent bg-destructive/10 text-destructive",
        idle: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      tone: "idle",
    },
  },
);

const statusDotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    tone: {
      ok: "bg-emerald-500",
      running: "bg-primary",
      warn: "bg-amber-500",
      error: "bg-destructive",
      idle: "bg-muted-foreground/50",
    },
  },
  defaultVariants: {
    tone: "idle",
  },
});

function StatusBadge({
  className,
  tone,
  withDot = true,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    withDot?: boolean;
  }) {
  return (
    <span className={cn(statusBadgeVariants({ tone, className }))} data-slot="status-badge" {...props}>
      {withDot ? <span aria-hidden="true" className={statusDotVariants({ tone })} /> : null}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
