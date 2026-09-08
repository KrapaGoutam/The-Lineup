"use client";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/**
 * Feature 021. A two-segment Light/Dark control -- the reference design's
 * `segL`/`segD` pill, built from existing tokens (the active segment is
 * just `bg-card text-foreground shadow-sm`, matching how every other
 * "raised" surface in this app is already styled) rather than four new
 * global tokens for a single component. Replaces `ThemeToggle`'s
 * single-button toggle in every place this feature touches, since a
 * segmented control states both options at once instead of only the one
 * you'd switch to -- `ThemeToggle` itself is untouched for callers that
 * still want the compact icon-button form.
 */
export function AppearanceSwitch({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={cn(
        "border-border bg-background inline-flex gap-0.5 rounded-full border p-0.5",
        className,
      )}
    >
      {(["light", "dark"] as const).map((option) => {
        const active = resolved === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setPreference(option)}
            aria-pressed={active}
            className={cn(
              "min-h-9 min-w-[64px] rounded-full px-4 text-sm font-semibold capitalize transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
