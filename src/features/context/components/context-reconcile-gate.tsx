"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  clearActiveContextAction,
  setActiveContextAction,
} from "@/features/context/actions/context-actions";
import { organizationPath } from "@/features/context/domain/context-navigation";

export interface ContextReconcileTarget {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly locationId: string;
}

type Outcome = { key: string; status: "done" | "failed" };

/**
 * V2-003.004 deep-link reconciliation gate.
 *
 * An explicit `?location=` supersedes the persisted preference for the PAGE
 * render (V2-003.002 rule D), but module Server Actions operate on the
 * persisted context. When the verified page context differs from the cookie
 * (or there is none that would resolve identically), the server flags the
 * page and this gate keeps the workspace unmounted -- so nothing can be read
 * or acted on -- until `setActiveContextAction` has re-verified the pair on
 * the server and persisted it. Nothing here is authorization: the ids are an
 * untrusted request that the server validates again. If it fails, the
 * workspace stays closed with a recovery path; it is never shown as active.
 *
 * Server-side, any action issued while the cookie and the workspace URL
 * disagree is refused anyway (see `getPrimaryLocation`), so a stale tab fails
 * closed even without this gate.
 */
export function ContextReconcileGate({
  target,
  activeLocationId,
  children,
}: {
  target: ContextReconcileTarget | null;
  /** The server-verified location on screen (enables URL canonicalization). */
  activeLocationId?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const key = target ? `${target.organizationId}:${target.locationId}` : null;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);

  const status: "ready" | "pending" | "failed" =
    key === null
      ? "ready"
      : outcome?.key === key
        ? outcome.status === "done"
          ? "ready"
          : "failed"
        : "pending";

  useEffect(() => {
    if (status !== "pending" || !target || !key) return;
    let alive = true;
    void (async () => {
      let ok = false;
      try {
        const result = await setActiveContextAction({
          organizationId: target.organizationId,
          locationId: target.locationId,
        });
        ok = result.ok;
      } catch {
        ok = false;
      }
      if (alive) setOutcome({ key, status: ok ? "done" : "failed" });
    })();
    return () => {
      alive = false;
    };
    // `attempt` re-arms the effect for an explicit retry.
  }, [status, target, key, attempt]);

  // Once the workspace is open, make the address bar name the location it is
  // showing. Server Actions are POSTed from this URL, so a stale tab (or a
  // back/forward entry) whose location differs from the persisted one is
  // refused server-side instead of silently operating on the other location.
  useEffect(() => {
    if (status !== "ready" || !activeLocationId) return;
    const url = new URL(window.location.href);
    if (!/^\/r\/[^/]+\/?$/.test(url.pathname)) return;
    if (url.searchParams.has("location")) return;
    url.searchParams.set("location", activeLocationId);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [status, activeLocationId]);

  if (status === "ready") return <>{children}</>;

  if (status === "pending") {
    return (
      <main
        className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-4"
        data-testid="context-reconciling"
      >
        <p
          role="status"
          aria-live="polite"
          className="text-muted-foreground text-sm"
        >
          Confirming your location…
        </p>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-4"
      data-testid="context-reconcile-failed"
    >
      <div className="border-border bg-card flex w-full flex-col gap-3 rounded-2xl border p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert aria-hidden className="text-muted-foreground size-5" />
          <h1 className="text-lg font-semibold">
            We couldn&apos;t confirm this location
          </h1>
        </div>
        <p role="alert" className="text-muted-foreground text-sm">
          Nothing has been loaded or changed. Try again, or choose a location
          you can access.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setOutcome(null);
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void (async () => {
                try {
                  await clearActiveContextAction();
                } finally {
                  router.replace(
                    target ? organizationPath(target.organizationSlug) : "/",
                  );
                }
              })();
            }}
          >
            Choose a location
          </Button>
        </div>
      </div>
    </main>
  );
}
