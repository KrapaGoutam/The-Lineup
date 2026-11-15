"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { AvailableContextSummary } from "@/features/context/domain/active-context";
import { groupContextsByOrganization } from "@/features/context/domain/context-navigation";
import { cn } from "@/lib/utils";

type ActiveSummary = Pick<
  AvailableContextSummary,
  "organizationId" | "organizationName" | "locationId" | "locationName"
>;

/**
 * V2-003.002 header switcher. Shows the active organization + location and,
 * when the user can legitimately operate more than one location, a grouped
 * menu of ONLY those locations (server-provided, display-safe). A user with a
 * single location sees a plain indicator and is never forced through a menu.
 * Selecting only requests a switch (`onSelect`); the server decides.
 */
export function ContextSwitcher({
  active,
  contexts,
  contextsUnavailable = false,
  switchingTo,
  onSelect,
  className,
}: {
  active: ActiveSummary;
  contexts: readonly AvailableContextSummary[];
  contextsUnavailable?: boolean;
  switchingTo?: AvailableContextSummary | null;
  onSelect: (context: AvailableContextSummary) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const groups = useMemo(
    () => groupContextsByOrganization(contexts),
    [contexts],
  );

  const label = (
    <span className="flex min-w-0 flex-col text-left leading-tight">
      <span className="truncate text-sm font-bold">
        {active.organizationName}
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {active.locationName}
      </span>
    </span>
  );

  const interactive = contexts.length > 1 && !contextsUnavailable;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected =
      rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      rootRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    selected?.focus();
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  if (!interactive) {
    return (
      <div
        className={cn("flex min-h-11 min-w-0 items-center", className)}
        data-testid="context-indicator"
        aria-label={`Workspace: ${active.organizationName}, ${active.locationName}`}
        role="group"
        title={
          contextsUnavailable
            ? "Other locations could not be loaded right now."
            : undefined
        }
      >
        {label}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative min-w-0", className)}
      data-testid="context-switcher"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Switch workspace. Current: ${active.organizationName}, ${active.locationName}`}
        disabled={!!switchingTo}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="hover:bg-muted focus-visible:ring-ring flex min-h-11 max-w-full items-center gap-1.5 rounded-xl px-2.5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        {label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Switch workspace"
          onKeyDown={onMenuKeyDown}
          className="border-border bg-card fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border p-2 pb-[calc(6rem+env(safe-area-inset-bottom))] shadow-xl lg:absolute lg:inset-x-auto lg:top-[calc(100%+0.5rem)] lg:bottom-auto lg:left-0 lg:max-h-[60dvh] lg:min-w-64 lg:rounded-2xl lg:pb-2"
          data-testid="context-switcher-menu"
        >
          <p className="text-faint px-2.5 pt-1 pb-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
            Switch workspace
          </p>
          {groups.map((group) => (
            <div
              key={group.organizationId}
              role="group"
              aria-label={group.organizationName}
              className="pb-1"
            >
              <p
                aria-hidden="true"
                className="text-muted-foreground px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
              >
                {group.organizationName}
              </p>
              {group.locations.map((context) => {
                const isActive =
                  context.locationId === active.locationId &&
                  context.organizationId === active.organizationId;
                return (
                  <button
                    key={context.locationId}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    data-location-id={context.locationId}
                    onClick={() => {
                      if (isActive) {
                        close(true);
                        return;
                      }
                      setOpen(false);
                      onSelect(context);
                    }}
                    className={cn(
                      "hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex min-h-12 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none",
                      isActive && "font-semibold",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {isActive ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {context.locationName}
                    </span>
                    {isActive ? (
                      <span className="text-muted-foreground text-xs">
                        Current
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
