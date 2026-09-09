import * as React from "react";

import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background/70 text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 [&>option]:bg-popover [&>option]:text-popover-foreground [&>optgroup]:bg-popover [&>optgroup]:text-popover-foreground [&_option]:bg-popover [&_option]:text-popover-foreground min-h-11 w-full rounded-xl border px-3 text-sm transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
