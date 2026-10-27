"use client";

import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Built on the repo's
 * native-<dialog> primitive (focus trap, Escape, focus restore for free).
 */
export function Sheet({
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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className={cn(
        "mt-auto mb-0 w-full max-w-none rounded-b-none sm:m-auto sm:w-[min(92vw,34rem)] sm:rounded-2xl",
        className,
      )}
    >
      {children}
    </Dialog>
  );
}
