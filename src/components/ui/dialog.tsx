"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Table Rotation Multi-View Upgrade 1.1 (multi-table): this repo has no
 * Dialog/Sheet/Popover primitive anywhere -- every existing component in
 * `components/ui/` wraps a plain native element (see button.tsx,
 * select.tsx), not a headless-UI library. This follows the same
 * convention: the native `<dialog>` element already provides a focus
 * trap, ESC-to-close, top-layer rendering, and default focus restoration
 * on close for free, with no new dependency. Responsive by default (see
 * className below) rather than a separate "Sheet" component for mobile --
 * there is nothing yet to be consistent with, and one component that
 * degrades to near-full-screen on small viewports is the smaller
 * surface area.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        // The browser's default ESC handling already closes the native
        // element; this just syncs the caller's `open` state to match.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A native <dialog> box always covers the viewport once open --
        // a click lands directly on it (not a child) only when it hit
        // the backdrop area.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "text-foreground border-border bg-card m-auto max-h-[90vh] w-[95vw] max-w-[min(92vw,32rem)] overflow-y-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-black/50 sm:w-[min(92vw,32rem)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="text-muted-foreground mt-1 text-sm"
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
