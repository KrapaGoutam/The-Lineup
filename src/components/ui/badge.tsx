import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeProps = React.ComponentProps<"span"> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
};

// Feature 021: warning/success/danger now key off the same --warn/--ok/
// --destructive tokens the countdown pill's urgency states use, at the
// same /15 background and /30 border opacity Button's `outline` variant
// already established for --primary -- one soft-badge convention across
// the app, not a token per component.
const tones = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-ok/30 bg-ok/15 text-ok",
  warning: "border-warn/30 bg-warn/15 text-warn",
  danger: "border-destructive/30 bg-destructive/15 text-destructive",
  accent: "border-primary/20 bg-primary/10 text-primary",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
